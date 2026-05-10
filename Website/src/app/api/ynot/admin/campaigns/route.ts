import { authErrorResponse, requireAdminOrOwner } from "@/lib/auth/require-role";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

type CampaignBody = {
  campaignId?: unknown;
  slug?: unknown;
  titleTh?: unknown;
  titleEn?: unknown;
  series?: unknown;
  status?: unknown;
  visibility?: unknown;
  mode?: unknown;
  priceThb?: unknown;
  costCoins?: unknown;
  totalSlots?: unknown;
  displayTags?: unknown;
  sortOrder?: unknown;
  categoryIds?: unknown;
  isTest?: unknown;
  seedRunId?: unknown;
  spinMode?: unknown;
  spinConfig?: unknown;
};

function text(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugValue(value: unknown) {
  const slug = text(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `campaign-${Date.now().toString(36)}`;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function displayTagsValue(value: unknown, series: "one_piece" | "pokemon") {
  const fallback = series === "pokemon" ? ["PSA10", "New Exclusive"] : ["Manga", "New Exclusive"];
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : fallback;
  const tags = source
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => text(tag, 28))
    .filter(Boolean)
    .filter((tag, index, all) => all.findIndex((candidate) => candidate.toLowerCase() === tag.toLowerCase()) === index)
    .slice(0, 4);
  return tags.length ? tags : fallback;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function idArrayValue(value: unknown) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return source
    .filter((item): item is string => typeof item === "string")
    .map((item) => text(item, 80))
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 8);
}

function campaignPatch(body: CampaignBody): Database["public"]["Tables"]["draw_rounds"]["Update"] {
  const priceThb = Math.max(1, Math.round(numberValue(body.priceThb, 100)));
  const totalSlots = Math.max(1, Math.round(numberValue(body.totalSlots, 100)));
  const costCoins = Math.max(1, Math.round(numberValue(body.costCoins, Math.ceil(priceThb / 100))));
  const series = body.series === undefined ? undefined : enumValue(body.series, ["one_piece", "pokemon"] as const, "pokemon");

  return {
    slug: body.slug === undefined ? undefined : slugValue(body.slug),
    title_th: body.titleTh === undefined ? undefined : text(body.titleTh) || "แคมเปญใหม่",
    title_en: body.titleEn === undefined ? undefined : text(body.titleEn) || text(body.titleTh) || "New campaign",
    series,
    // Direct status changes are restricted to non-mechanics transitions only.
    // Use /api/ynot/admin/campaigns/[id]/{submit,approve,reject,publish,...} to
    // move through the approval workflow. Allowing 'live' here would bypass
    // owner approval.
    status:
      body.status === undefined
        ? undefined
        : enumValue(
            body.status,
            ["draft", "closed", "archived"] as const,
            "draft",
          ),
    visibility: body.visibility === undefined ? undefined : enumValue(body.visibility, ["public", "hidden", "private"] as const, "private"),
    mode: body.mode === undefined ? undefined : enumValue(body.mode, ["slot_pick", "instant_gacha"] as const, "instant_gacha"),
    price_thb: body.priceThb === undefined ? undefined : priceThb,
    cost_coins: body.costCoins === undefined ? undefined : costCoins,
    total_slots: body.totalSlots === undefined ? undefined : totalSlots,
    display_tags: body.displayTags === undefined ? undefined : displayTagsValue(body.displayTags, series ?? "pokemon"),
    sort_order: body.sortOrder === undefined ? undefined : Math.round(numberValue(body.sortOrder, 100)),
    is_test: body.isTest === undefined ? undefined : booleanValue(body.isTest),
    seed_run_id: body.seedRunId === undefined ? undefined : text(body.seedRunId, 80) || null,
    spin_mode:
      body.spinMode === undefined
        ? undefined
        : enumValue(body.spinMode, ["pure_random", "weighted", "inventory_gate"] as const, "pure_random"),
    spin_config:
      body.spinConfig === undefined
        ? undefined
        : ((body.spinConfig && typeof body.spinConfig === "object" && !Array.isArray(body.spinConfig)
            ? body.spinConfig
            : {}) as Database["public"]["Tables"]["draw_rounds"]["Insert"]["spin_config"]),
  };
}

async function replaceCampaignCategories(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  campaignId: string,
  categoryIds: string[],
) {
  const rows: Database["public"]["Tables"]["draw_round_categories"]["Insert"][] = categoryIds.map((categoryId, index) => ({
    draw_round_id: campaignId,
    category_id: categoryId,
    is_primary: index === 0,
  }));
  const { error: deleteError } = await supabase.from("draw_round_categories").delete().eq("draw_round_id", campaignId);
  if (deleteError) throw deleteError;
  if (!rows.length) return;
  const { error: insertError } = await supabase.from("draw_round_categories").insert(rows);
  if (insertError) throw insertError;
}

async function bodyJson(request: Request): Promise<CampaignBody | null> {
  return request.json().catch(() => null) as Promise<CampaignBody | null>;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  let admin;
  try {
    admin = await requireAdminOrOwner();
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const limited = await enforceRateLimit(request, "ynot:admin:campaigns", { limit: 40, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const patch = campaignPatch(body);
  const insert: Database["public"]["Tables"]["draw_rounds"]["Insert"] = {
    slug: slugValue(body.slug),
    title_th: text(body.titleTh) || "แคมเปญใหม่",
    title_en: text(body.titleEn) || text(body.titleTh) || "New campaign",
    series: patch.series ?? "pokemon",
    status: patch.status ?? "draft",
    visibility: patch.visibility ?? "private",
    mode: patch.mode ?? "instant_gacha",
    price_thb: patch.price_thb ?? 100,
    cost_coins: patch.cost_coins ?? 1,
    total_slots: patch.total_slots ?? 100,
    display_tags: patch.display_tags ?? displayTagsValue(body.displayTags, patch.series ?? "pokemon"),
    sort_order: patch.sort_order ?? 100,
    order_code_prefix: "YN",
    created_by: admin.adminId,
    is_test: patch.is_test ?? false,
    seed_run_id: patch.seed_run_id ?? null,
    spin_mode: patch.spin_mode ?? "pure_random",
    spin_config: patch.spin_config ?? {},
  };

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("draw_rounds").insert(insert).select("id,slug").single();
  if (error) return Response.json({ error: error.message }, { status: 409 });
  if (body.categoryIds !== undefined) {
    try {
      await replaceCampaignCategories(supabase, data.id, idArrayValue(body.categoryIds));
    } catch (categoryError) {
      return Response.json({ error: categoryError instanceof Error ? categoryError.message : "Campaign category assignment failed." }, { status: 409 });
    }
  }
  await supabase.rpc("create_draw_slots", { p_draw_round_id: data.id });
  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "campaign_created", draw_round_id: data.id, metadata: { slug: data.slug, isTest: insert.is_test } });
  return Response.json({ ok: true, campaign: data });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  let admin;
  try {
    admin = await requireAdminOrOwner();
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const limited = await enforceRateLimit(request, "ynot:admin:campaigns", { limit: 40, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const campaignId = text(body?.campaignId, 80);
  if (!body || !campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });

  const patch = campaignPatch(body);
  // PATCH never changes spin_mode/spin_config directly: those go through
  // /api/ynot/admin/campaigns/[id]/spin-config (which uses the audit-tracked
  // RPC and respects the lock). Stripping silently keeps the surface
  // backward-compatible with callers that send the full patch.
  const mechanicsRequested = [
    patch.mode,
    patch.price_thb,
    patch.cost_coins,
    patch.total_slots,
    patch.is_test,
    patch.seed_run_id,
  ].some((value) => value !== undefined);
  // Direct status PATCH is disabled so callers cannot bypass submit/approve/
  // publish/cancel/end workflow RPCs.
  delete patch.status;
  delete patch.spin_mode;
  delete patch.spin_config;
  const supabase = createServiceSupabaseClient();

  const { data: campaign, error: lookupError } = await supabase
    .from("draw_rounds")
    .select("id,status,locked_at,created_by")
    .eq("id", campaignId)
    .single();
  if (lookupError || !campaign) return Response.json({ error: "campaign_not_found" }, { status: 404 });
  if (admin.adminRole === "admin" && (campaign.status !== "draft" || campaign.created_by !== admin.adminId)) {
    return Response.json({ error: "not_draft_owner" }, { status: 403 });
  }
  if (mechanicsRequested && campaign.status !== "draft") {
    return Response.json({ error: "campaign_requires_draft_for_mechanics_edit" }, { status: 409 });
  }
  if (mechanicsRequested && campaign.locked_at) {
    return Response.json({ error: "campaign_locked" }, { status: 409 });
  }

  const { error } = await supabase.from("draw_rounds").update(patch).eq("id", campaignId);
  if (error) return Response.json({ error: error.message }, { status: 409 });
  if (body.categoryIds !== undefined) {
    try {
      await replaceCampaignCategories(supabase, campaignId, idArrayValue(body.categoryIds));
    } catch (categoryError) {
      return Response.json({ error: categoryError instanceof Error ? categoryError.message : "Campaign category assignment failed." }, { status: 409 });
    }
  }
  if (patch.total_slots) await supabase.rpc("create_draw_slots", { p_draw_round_id: campaignId });
  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "campaign_updated", draw_round_id: campaignId, metadata: { patch } });
  return Response.json({ ok: true });
}
