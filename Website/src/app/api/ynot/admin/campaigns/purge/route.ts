import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { adminErrorResponse } from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

// Owner-only destructive purge of a non-live test pack: deletes the pack + all its
// play data (opens, collection items, slots, prizes, units), refunds the coins
// spent on it, and releases the stock it held. The heavy lifting + every safety
// guard lives in the purge_test_draw_round RPC (single transaction).
function purgeErrorMessage(message?: string) {
  switch (message) {
    case "owner_role_required":
    case "active_admin_required":
      return "Owner access is required to purge a pack.";
    case "cannot_purge_live_pack":
      return "A live or public pack cannot be purged. Close or archive it first.";
    case "round_has_exchange_or_shipping_items":
      return "This pack's awarded cards are in an exchange or shipping order — resolve those first.";
    case "round_has_orders":
      return "This pack has legacy lucky-draw orders and can't be purged here.";
    case "campaign_not_found":
      return "Pack not found.";
    default:
      return "The pack could not be purged.";
  }
}

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

  const admin = await resolveAdminSession();
  if (!admin) {
    return adminErrorResponse(
      "ADMIN_ACCESS_REQUIRED",
      "Admin access is required.",
      403,
    );
  }
  if (admin.adminRole !== "owner") {
    return adminErrorResponse(
      "OWNER_ACCESS_REQUIRED",
      "Owner access is required to purge a pack.",
      403,
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:purge-pack",
    { limit: 10, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    campaignId?: unknown;
  } | null;
  const campaignId =
    typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  if (!campaignId) {
    return adminErrorResponse(
      "CAMPAIGN_ID_REQUIRED",
      "campaignId is required.",
      400,
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("purge_test_draw_round", {
    p_draw_round_id: campaignId,
    p_admin_id: admin.adminId,
  });
  if (error) {
    return adminErrorResponse(
      error.code ?? "PURGE_FAILED",
      purgeErrorMessage(error.message),
      409,
      { detail: error.details ?? null, hint: error.hint ?? null },
    );
  }
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, result: data });
}
