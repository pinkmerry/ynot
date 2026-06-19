import { findOrderByPublicCodeForProfile, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type PickBody = {
  orderId?: unknown;
  slots?: unknown;
};

const pickFailureMessage = "Could not confirm selected numbers. Please refresh and try again.";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;

  const session = await resolveCurrentProfile();
  if (!session) {
    return Response.json({ error: "Login is required before picking slots." }, { status: 401 });
  }

  const limited = await enforceRateLimit(
    request,
    "ynot:legacy-picks:confirm",
    { limit: 30, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  let body: PickBody;
  try {
    body = (await request.json()) as PickBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.orderId !== "string" || !body.orderId.trim()) {
    return Response.json({ error: "Missing order ID." }, { status: 400 });
  }

  if (!Array.isArray(body.slots) || body.slots.length === 0) {
    return Response.json({ error: "Select at least one slot." }, { status: 400 });
  }

  const slots = body.slots.map(Number);
  if (slots.some((slot) => !Number.isInteger(slot) || slot <= 0)) {
    return Response.json({ error: "Invalid slot numbers." }, { status: 400 });
  }

  if (new Set(slots).size !== slots.length) {
    return Response.json({ error: "Duplicate slot numbers are not allowed." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const order = await findOrderByPublicCodeForProfile(supabase, body.orderId, session.profileId);
  if (!order) {
    return Response.json({ error: pickFailureMessage }, { status: 404 });
  }

  if (!session.adminId && slots.length !== order.quantity) {
    return Response.json({ error: pickFailureMessage }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("claim_order_slots", {
    p_order_id: order.id,
    p_slot_numbers: slots,
    p_actor_profile_id: session.profileId,
    p_actor_admin_id: session.adminId ?? null,
  });

  if (error) {
    const rpcMessage = String((error as { message?: unknown })["message"] ?? error);
    console.warn("legacy_customer_pick_failed", {
      profileId: session.profileId,
      orderPublicCode: body.orderId,
      message: rpcMessage,
    });
    return Response.json({ error: pickFailureMessage }, { status: 409 });
  }

  return Response.json({ picks: data });
}
