import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

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
    status: body.status === undefined ? undefined : enumValue(body.status, ["draft", "live", "closed", "archived"] as const, "draft"),
    visibility: body.visibility === undefined ? undefined : enumValue(body.visibility, ["public", "hidden", "private"] as const, "private"),
    mode: body.mode === undefined ? undefined : enumValue(body.mode, ["slot_pick", "instant_gacha"] as const, "instant_gacha"),
    price_thb: body.priceThb === undefined ? undefined : priceThb,
    cost_coins: body.costCoins === undefined ? undefined : costCoins,
    total_slots: body.totalSlots === undefined ? undefined : totalSlots,
    display_tags: body.displayTags === undefined ? undefined : displayTagsValue(body.displayTags, series ?? "pokemon"),
    sort_order: body.sortOrder === undefined ? undefined : Math.round(numberValue(body.sortOrder, 100)),
  };
}

async function bodyJson(request: Request): Promise<CampaignBody | null> {
  return request.json().catch(() => null) as Promise<CampaignBody | null>;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });

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
  };

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("draw_rounds").insert(insert).select("id,slug").single();
  if (error) return Response.json({ error: error.message }, { status: 409 });
  await supabase.rpc("create_draw_slots", { p_draw_round_id: data.id });
  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "campaign_created", draw_round_id: data.id, metadata: { slug: data.slug } });
  return Response.json({ ok: true, campaign: data });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });

  const body = await bodyJson(request);
  const campaignId = text(body?.campaignId, 80);
  if (!body || !campaignId) return Response.json({ error: "campaignId is required." }, { status: 400 });

  const patch = campaignPatch(body);
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("draw_rounds").update(patch).eq("id", campaignId);
  if (error) return Response.json({ error: error.message }, { status: 409 });
  if (patch.total_slots) await supabase.rpc("create_draw_slots", { p_draw_round_id: campaignId });
  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "campaign_updated", draw_round_id: campaignId, metadata: { patch } });
  return Response.json({ ok: true });
}
