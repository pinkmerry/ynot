import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type CardBody = {
  cardId?: unknown;
  code?: unknown;
  name?: unknown;
  series?: unknown;
  grade?: unknown;
  tone?: unknown;
  imageUrl?: unknown;
};

function text(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cardCode(value: unknown) {
  const clean = text(value, 48)
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || null;
}

function searchName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, " ").replace(/\s+/g, " ").trim() || "card";
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

async function bodyJson(request: Request): Promise<CardBody | null> {
  return request.json().catch(() => null) as Promise<CardBody | null>;
}

function cardPatch(body: CardBody): Database["public"]["Tables"]["cards"]["Insert"] {
  const name = text(body.name) || "Untitled Card";
  const code = cardCode(body.code);
  return {
    card_code: code,
    name,
    search_name: searchName(name),
    search_code: code?.toLowerCase() ?? null,
    series: enumValue(body.series, ["one_piece", "pokemon"] as const, "pokemon"),
    grade: text(body.grade, 80) || "Ungraded",
    tone: enumValue(body.tone, ["red", "gold", "blue", "green", "rose", "violet"] as const, "gold"),
    image_url: text(body.imageUrl, 1000) || null,
  };
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });

  const patch = cardPatch(body);
  const supabase = createServiceSupabaseClient();
  const existingQuery = patch.search_code
    ? supabase.from("cards").select("id").eq("search_code", patch.search_code).limit(1)
    : supabase.from("cards").select("id").eq("search_name", patch.search_name).limit(1);
  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) return Response.json({ error: existingError.message }, { status: 409 });

  const query = existing?.[0]
    ? supabase.from("cards").update(patch).eq("id", existing[0].id).select("id,name,card_code").single()
    : supabase.from("cards").insert(patch).select("id,name,card_code").single();
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "card_saved", collection_item_id: null, metadata: { cardId: data.id, code: data.card_code } });
  return Response.json({ ok: true, card: data });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });

  const body = await bodyJson(request);
  const cardId = text(body?.cardId, 80);
  if (!body || !cardId) return Response.json({ error: "cardId is required." }, { status: 400 });

  const patch = cardPatch(body);
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("cards").update(patch).eq("id", cardId).select("id,name,card_code").single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "card_updated", metadata: { cardId: data.id, code: data.card_code } });
  return Response.json({ ok: true, card: data });
}
