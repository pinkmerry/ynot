// New card-conversion endpoint. Reuses the same RPC as /api/ynot/exchange,
// but lives under /collection/convert so the collection page UI naming is
// consistent with the new feature. Both routes are safe to call.

import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { requireVerifiedAnchor } from "@/lib/auth/verified-anchor";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  const session = await resolveCurrentProfile();
  if (!session?.profileId) {
    return Response.json({ error: "Login is required." }, { status: 401 });
  }
  const blocked = await requireVerifiedAnchor(session);
  if (blocked) return blocked;
  const limited = await enforceRateLimit(
    request,
    "ynot:convert:submit",
    { limit: 20, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as {
    collectionItemIds?: unknown;
    idempotencyKey?: unknown;
  } | null;
  const collectionItemIds = Array.isArray(body?.collectionItemIds)
    ? body.collectionItemIds.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const idempotencyKey =
    typeof body?.idempotencyKey === "string"
      ? body.idempotencyKey
      : crypto.randomUUID();

  if (!collectionItemIds.length) {
    return Response.json(
      { error: "Select at least one card to convert." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("submit_card_conversion", {
    p_profile_id: session.profileId,
    p_collection_item_ids: collectionItemIds,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  return Response.json({ result: data });
}
