import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { prizeCategoryValue } from "@/features/ynot/prize-category";

export const dynamic = "force-dynamic";

type CardBody = {
  cardId?: unknown;
  code?: unknown;
  name?: unknown;
  series?: unknown;
  grade?: unknown;
  prizeCategory?: unknown;
  imageUrl?: unknown;
  isTest?: unknown;
  assetSource?: unknown;
  assetLicense?: unknown;
  assetManifestKey?: unknown;
  seedRunId?: unknown;
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

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function assertApprovedTestAsset(body: CardBody) {
  if (!booleanValue(body.isTest)) return null;
  const imageUrl = text(body.imageUrl, 1000);
  const manifestKey = text(body.assetManifestKey, 160);
  const source = text(body.assetSource, 300);
  const license = text(body.assetLicense, 160);
  if (!manifestKey || !source || !license) {
    return "Test cards require assetManifestKey, assetSource, and assetLicense so production test assets are auditable.";
  }
  if (/japan-toreca\\.com/i.test(imageUrl) || /japan-toreca/i.test(source)) {
    return "Japan Toreca images are not approved for production test data. Use generated/original/licensed assets only.";
  }
  if (!imageUrl) return null;
  if (imageUrl.startsWith("/test-assets/")) return null;
  try {
    const parsed = new URL(imageUrl);
    const allowedHost =
      parsed.hostname.endsWith(".supabase.co") ||
      ["ynotopen.com", "www.ynotopen.com", "localhost"].includes(parsed.hostname);
    return allowedHost ? null : "External test-card image hosts are blocked unless copied to approved storage or /test-assets/ with manifest evidence.";
  } catch {
    return "Test-card image URL must be a /test-assets/ path or approved HTTPS storage URL.";
  }
}

async function bodyJson(request: Request): Promise<CardBody | null> {
  return request.json().catch(() => null) as Promise<CardBody | null>;
}

function cardPatch(body: CardBody): Database["public"]["Tables"]["cards"]["Insert"] {
  const name = text(body.name) || "Untitled Card";
  const code = cardCode(body.code);
  const isTest = booleanValue(body.isTest);
  const patch: Database["public"]["Tables"]["cards"]["Insert"] = {
    card_code: code,
    name,
    search_name: searchName(name),
    search_code: code?.toLowerCase() ?? null,
    series: enumValue(body.series, ["one_piece", "pokemon"] as const, "pokemon"),
    grade: text(body.grade, 80) || "Ungraded",
    prize_category: prizeCategoryValue(body.prizeCategory),
    image_url: text(body.imageUrl, 1000) || null,
  };
  if (isTest || body.seedRunId !== undefined || body.assetSource !== undefined || body.assetLicense !== undefined || body.assetManifestKey !== undefined) {
    patch.is_test = isTest;
    patch.seed_run_id = text(body.seedRunId, 80) || null;
    patch.asset_source = text(body.assetSource, 300) || null;
    patch.asset_license = text(body.assetLicense, 160) || null;
    patch.asset_manifest_key = text(body.assetManifestKey, 160) || null;
  }
  return patch;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:cards", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  if (!body) return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  const assetError = assertApprovedTestAsset(body);
  if (assetError) return Response.json({ error: assetError }, { status: 400 });

  const patch = cardPatch(body);
  const supabase = createServiceSupabaseClient();
  const existingQuery = patch.search_code
    ? supabase.from("cards").select("id").eq("search_code", patch.search_code).limit(1)
    : supabase.from("cards").select("id").eq("search_name", patch.search_name).limit(1);
  const { data: existing, error: existingError } = await existingQuery;
  if (existingError) return Response.json({ error: existingError.message }, { status: 409 });

  const query = existing?.[0]
    ? supabase.from("cards").update(patch).eq("id", existing[0].id).select("id,name,card_code,prize_category").single()
    : supabase.from("cards").insert(patch).select("id,name,card_code,prize_category").single();
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "card_saved", collection_item_id: null, metadata: { cardId: data.id, code: data.card_code } });
  return Response.json({ ok: true, card: data });
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:cards", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const cardId = text(body?.cardId, 80);
  if (!cardId) return Response.json({ error: "cardId is required." }, { status: 400 });

  const supabase = createServiceSupabaseClient();

  // Eligibility: refuse delete if the card is referenced by any active
  // prize row in a pack (deleting it would orphan the prize slot). The
  // UI also disables the button in that case but we re-check on the
  // server so a stale page can't bypass it.
  const { count: prizeCount, error: prizeError } = await supabase
    .from("draw_round_prizes")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId);
  if (prizeError) return Response.json({ error: prizeError.message }, { status: 409 });
  if ((prizeCount ?? 0) > 0) {
    return Response.json(
      {
        ok: false,
        code: "CARD_IN_PRIZE_POOL",
        error: `Cannot delete: ${prizeCount} pack prize slot${prizeCount === 1 ? "" : "s"} still reference this card.`,
        prizeCount,
      },
      { status: 409 },
    );
  }

  // Eligibility: refuse delete if any stock unit is still active
  // (available / reserved / allocated). Allocated units are owned by
  // a customer — deleting the card would orphan their collection row.
  const { data: stockRows, error: stockError } = await supabase
    .from("card_stock_units")
    .select("status")
    .eq("card_id", cardId)
    .limit(50000);
  if (stockError) return Response.json({ error: stockError.message }, { status: 409 });
  const activeStock = (stockRows ?? []).filter(
    (row) => row.status === "available" || row.status === "reserved" || row.status === "allocated",
  );
  if (activeStock.length > 0) {
    const breakdown = { available: 0, reserved: 0, allocated: 0 };
    for (const row of activeStock) {
      breakdown[row.status as keyof typeof breakdown] += 1;
    }
    return Response.json(
      {
        ok: false,
        code: "CARD_HAS_ACTIVE_STOCK",
        error: `Cannot delete: ${activeStock.length} active stock unit${activeStock.length === 1 ? "" : "s"} still exist (${breakdown.allocated} allocated to customers, ${breakdown.reserved} reserved, ${breakdown.available} available). Allocated units cannot be removed.`,
        activeStockCount: activeStock.length,
        breakdown,
      },
      { status: 409 },
    );
  }

  // Load the current card so the audit row carries identifying info
  // even after the row is gone.
  const { data: current, error: fetchError } = await supabase
    .from("cards")
    .select("id,name,card_code,series,is_test")
    .eq("id", cardId)
    .maybeSingle();
  if (fetchError) return Response.json({ error: fetchError.message }, { status: 409 });
  if (!current) return Response.json({ error: "Card not found." }, { status: 404 });

  const { error: deleteError } = await supabase.from("cards").delete().eq("id", cardId);
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 409 });

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "card_deleted",
    metadata: {
      cardId: current.id,
      code: current.card_code,
      name: current.name,
      series: current.series,
      isTest: current.is_test,
    },
  });
  return Response.json({ ok: true, cardId });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(request, "ynot:admin:cards", { limit: 60, windowMs: 60_000 }, admin.profileId);
  if (limited) return limited;

  const body = await bodyJson(request);
  const cardId = text(body?.cardId, 80);
  if (!body || !cardId) return Response.json({ error: "cardId is required." }, { status: 400 });
  const assetError = assertApprovedTestAsset(body);
  if (assetError) return Response.json({ error: assetError }, { status: 400 });

  const patch = cardPatch(body);
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from("cards").update(patch).eq("id", cardId).select("id,name,card_code,prize_category").single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({ actor_admin_id: admin.adminId, event_type: "card_updated", metadata: { cardId: data.id, code: data.card_code } });
  return Response.json({ ok: true, card: data });
}
