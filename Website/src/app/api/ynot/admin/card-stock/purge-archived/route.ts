import { revalidateTag } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

// Owner-only: hard-delete a card's archived stock units (purge_archived_card_stock RPC).
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;

  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }
  if (admin.adminRole !== "owner") {
    return Response.json(
      { error: "Owner access is required to purge archived stock." },
      { status: 403 },
    );
  }
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:purge-archived-stock",
    { limit: 30, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    cardId?: unknown;
  } | null;
  const cardId = typeof body?.cardId === "string" ? body.cardId.trim() : "";
  if (!cardId) {
    return Response.json({ error: "cardId is required." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("purge_archived_card_stock", {
    p_card_id: cardId,
    p_admin_id: admin.adminId,
  });
  if (error) {
    const message =
      error.message === "owner_role_required" ||
      error.message === "active_admin_required"
        ? "Owner access is required."
        : "Archived stock could not be purged.";
    return Response.json({ error: message }, { status: 409 });
  }
  revalidateTag("campaigns", "max");
  return Response.json({ ok: true, result: data });
}
