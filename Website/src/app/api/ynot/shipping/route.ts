import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const session = await resolveCurrentProfile();
  if (!session?.profileId) return Response.json({ error: "Login is required." }, { status: 401 });
  const limited = await enforceRateLimit(request, "ynot:shipping:request", { limit: 20, windowMs: 60_000 }, session.profileId);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { addressId?: unknown; collectionItemIds?: unknown; note?: unknown; idempotencyKey?: unknown } | null;
  const addressId = typeof body?.addressId === "string" ? body.addressId : "";
  const collectionItemIds = Array.isArray(body?.collectionItemIds) ? body.collectionItemIds.filter((value): value is string => typeof value === "string") : [];
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : crypto.randomUUID();
  if (!addressId) return Response.json({ error: "Shipping address is required." }, { status: 400 });
  if (!collectionItemIds.length) return Response.json({ error: "Select at least one card." }, { status: 400 });
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.rpc("request_shipping_for_items", { p_profile_id: session.profileId, p_address_id: addressId, p_collection_item_ids: collectionItemIds, p_customer_note: note, p_idempotency_key: idempotencyKey });
  if (error) return Response.json({ error: error.message }, { status: 409 });
  return Response.json({ result: data });
}
