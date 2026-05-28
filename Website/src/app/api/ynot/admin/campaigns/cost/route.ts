import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { isDevAuthAllowed } from "@/lib/security/dev-auth";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CAMPAIGN_COST_COINS = 1_000_000;

/**
 * Single-purpose endpoint: move a campaign into a different price tier by
 * rewriting its `cost_coins` column. The storefront groups packs into
 * Legendary / Gold / Silver / Common purely by cost, so the easiest way
 * for an admin to "add a pack to COMMON" is to click an existing pack and
 * let us set the cost to a value inside that bucket.
 *
 * Explicit dev auth can skip the admin gate so preview/local environments
 * still let the UI work end-to-end when opted in.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse(
      "SUPABASE_NOT_CONFIGURED",
      "Supabase is not configured.",
      503,
    );
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;
  const isDev = isDevAuthAllowed();
  const admin = await resolveAdminSession();
  if (!admin && !isDev) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:campaigns:cost",
    { limit: 40, windowMs: 60_000 },
    admin?.profileId,
  );
  if (limited) return limited;

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

  // Dev-mode mock id support — the storefront fallback packs use
  // synthetic ids that aren't real DB rows. Return ok without touching
  // Supabase so the local UX still feels responsive.
  if (isDev && campaignId.startsWith("storefront-")) {
    const mockCostCoins = Math.min(
      MAX_CAMPAIGN_COST_COINS,
      Math.max(1, rawCost),
    );
    return Response.json({
      ok: true,
      campaignId,
      costCoins: mockCostCoins,
      mock: true,
    });
  }

  if (!UUID_RE.test(campaignId)) {
    return adminErrorResponse(
      "INVALID_CAMPAIGN",
      "Choose a valid random pack.",
      400,
    );
  }
  if (rawCost < 1 || rawCost > MAX_CAMPAIGN_COST_COINS) {
    return adminErrorResponse(
      "INVALID_COST",
      `Cost must be between 1 and ${MAX_CAMPAIGN_COST_COINS.toLocaleString()} coins.`,
      400,
    );
  }
  const costCoins = rawCost;

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("draw_rounds")
    .update({ cost_coins: costCoins })
    .eq("id", campaignId);
  if (error) {
    return adminErrorResponse(
      "CAMPAIGN_COST_UPDATE_FAILED",
      "Could not update campaign cost.",
      409,
    );
  }

  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, campaignId, costCoins });
}
