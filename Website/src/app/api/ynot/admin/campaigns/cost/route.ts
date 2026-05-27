import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { isDevBypassAllowed } from "@/lib/security/dev-bypass";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

/**
 * Single-purpose endpoint: move a campaign into a different price tier by
 * rewriting its `cost_coins` column. The storefront groups packs into
 * Legendary / Gold / Silver / Common purely by cost, so the easiest way
 * for an admin to "add a pack to COMMON" is to click an existing pack and
 * let us set the cost to a value inside that bucket.
 *
 * In dev (no Supabase admin session) we skip the admin gate so the
 * preview / local environments still let the UI work end-to-end.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured.",
      503,
    );
  }
  const isDev = isDevBypassAllowed();
  const admin = await resolveAdminSession();
  if (!admin && !isDev) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { campaignId?: unknown; costCoins?: unknown }
    | null;
  const campaignId =
    typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const rawCost = Math.round(Number(body?.costCoins));
  if (!campaignId || !Number.isFinite(rawCost)) {
    return adminErrorResponse(
      "INVALID_BODY",
      "Provide { campaignId: string, costCoins: number }.",
      400,
    );
  }
  const costCoins = Math.max(1, rawCost);

  // Dev-mode mock id support — the storefront fallback packs use
  // synthetic ids that aren't real DB rows. Return ok without touching
  // Supabase so the local UX still feels responsive.
  if (isDev && campaignId.startsWith("storefront-")) {
    return Response.json({ ok: true, campaignId, costCoins, mock: true });
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("draw_rounds")
    .update({ cost_coins: costCoins })
    .eq("id", campaignId);
  if (error) {
    return adminErrorResponse(
      error.code ?? "CAMPAIGN_COST_UPDATE_FAILED",
      error.message,
      409,
      { detail: error.details ?? null, hint: error.hint ?? null },
    );
  }

  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, campaignId, costCoins });
}
