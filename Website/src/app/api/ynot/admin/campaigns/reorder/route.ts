import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";
import { DEMO_PACK_ORDER_COOKIE } from "@/features/ynot/demo-pack-order";

export const dynamic = "force-dynamic";

type ReorderSwap = { id: unknown; sortOrder: unknown };

/**
 * Sort-order-only patcher. Unlike the main PATCH route, this one is allowed
 * regardless of the campaign's draft/approved status — reordering on the
 * storefront never touches inventory or prize logic, so the draft-lock isn't
 * relevant here. Accepts a list of {id, sortOrder} pairs so the client can
 * atomically swap neighbouring positions.
 *
 * In demo mode (no Supabase), the swap is persisted to a cookie so the dev
 * storefront — which renders hardcoded `featuredCampaigns` — can show the
 * reordered cards on the next render.
 */
export async function POST(request: Request) {
  const supabaseReady = isSupabaseConfigured();
  // Skip admin gate when Supabase isn't configured — we're in demo/dev mode
  // and there's no real auth backend to ask. Production always has Supabase.
  let admin: Awaited<ReturnType<typeof resolveAdminSession>> | null = null;
  if (supabaseReady) {
    admin = await resolveAdminSession();
    if (!admin) {
      return adminErrorResponse(
        "ADMIN_ACCESS_REQUIRED",
        "Admin access is required.",
        403,
      );
    }
    const limited = await enforceRateLimit(
      request,
      "ynot:admin:campaign-reorder",
      { limit: 60, windowMs: 60_000 },
      admin.profileId,
    );
    if (limited) return limited;
  }

  let body: { swaps?: ReorderSwap[] } | null = null;
  try {
    body = (await request.json()) as { swaps?: ReorderSwap[] };
  } catch {
    return adminErrorResponse("INVALID_BODY", "Body must be JSON.", 400);
  }

  const swaps = Array.isArray(body?.swaps) ? body!.swaps : [];
  if (!swaps.length) {
    return adminErrorResponse(
      "REORDER_SWAPS_REQUIRED",
      "Provide at least one {id, sortOrder} swap.",
      400,
    );
  }

  const normalised = swaps
    .map((swap) => {
      const id = typeof swap.id === "string" ? swap.id.trim() : "";
      const parsedOrder = Math.round(Number(swap.sortOrder));
      if (!id || !Number.isFinite(parsedOrder)) return null;
      return { id, sortOrder: Math.max(0, parsedOrder) };
    })
    .filter((entry): entry is { id: string; sortOrder: number } => !!entry);

  if (!normalised.length) {
    return adminErrorResponse(
      "REORDER_SWAPS_INVALID",
      "No valid {id, sortOrder} entries provided.",
      400,
    );
  }

  if (!supabaseReady) {
    // Demo mode: persist the new positions in a cookie so the next render of
    // /packs picks them up. Cookie expires in 30 days; only set on this site.
    const cookieStore = await cookies();
    const existingRaw = cookieStore.get(DEMO_PACK_ORDER_COOKIE)?.value;
    let existing: Record<string, number> = {};
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (parsed && typeof parsed === "object") {
          existing = parsed as Record<string, number>;
        }
      } catch {
        existing = {};
      }
    }
    for (const entry of normalised) {
      existing[entry.id] = entry.sortOrder;
    }
    cookieStore.set(DEMO_PACK_ORDER_COOKIE, JSON.stringify(existing), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
    return Response.json({
      ok: true,
      updated: normalised.length,
      mode: "demo-cookie",
    });
  }

  const supabase = createServiceSupabaseClient();
  for (const entry of normalised) {
    const { error } = await supabase
      .from("draw_rounds")
      .update({ sort_order: entry.sortOrder })
      .eq("id", entry.id);
    if (error) {
      return adminErrorResponse(
        error.code ?? "CAMPAIGN_REORDER_FAILED",
        error.message,
        409,
        { detail: error.details ?? null, hint: error.hint ?? null },
      );
    }
  }

  revalidateTag("ynot:campaigns", "max");
  return Response.json({ ok: true, updated: normalised.length });
}
