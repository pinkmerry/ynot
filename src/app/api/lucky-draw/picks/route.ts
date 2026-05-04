import { cookies } from "next/headers";
import { findOrderByPublicCode, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { readSessionCookie } from "@/lib/lucky-draw/session";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type PickBody = {
  orderId?: unknown;
  slots?: unknown;
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const session = readSessionCookie(await cookies());
  if (!session) {
    return Response.json({ error: "LINE login is required before picking slots." }, { status: 401 });
  }

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
  const order = await findOrderByPublicCode(supabase, body.orderId);
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  if (!session.adminId && slots.length !== order.quantity) {
    return Response.json({ error: "Select exactly the number of slots in this order." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("claim_order_slots", {
    p_order_id: order.id,
    p_slot_numbers: slots,
    p_actor_profile_id: session.profileId,
    p_actor_admin_id: session.adminId ?? null,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 409 });
  }

  return Response.json({ picks: data });
}
