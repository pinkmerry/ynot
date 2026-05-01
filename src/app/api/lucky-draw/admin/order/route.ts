import { cookies } from "next/headers";
import { findOrderByPublicCode, fromOrderStatus, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { isAdminSession, readSessionCookie } from "@/lib/lucky-draw/session";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/lucky-draw/types";

type UpdateOrderBody = {
  orderId?: unknown;
  status?: unknown;
  slots?: unknown;
};

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const session = readSessionCookie(await cookies());
  if (!isAdminSession(session)) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }

  let body: UpdateOrderBody;
  try {
    body = (await request.json()) as UpdateOrderBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.orderId !== "string" || !body.orderId.trim()) {
    return Response.json({ error: "Missing order ID." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const order = await findOrderByPublicCode(supabase, body.orderId);
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  if (Array.isArray(body.slots)) {
    const slots = body.slots.map(Number);
    const { error } = await supabase.rpc("claim_order_slots", {
      p_order_id: order.id,
      p_slot_numbers: slots,
      p_actor_profile_id: null,
      p_actor_admin_id: session?.adminId ?? null,
    });

    if (error) return Response.json({ error: error.message }, { status: 409 });
    return Response.json({ ok: true });
  }

  if (body.status !== "approved" && body.status !== "rejected" && body.status !== "pending") {
    return Response.json({ error: "Unsupported order status." }, { status: 400 });
  }

  const status = body.status as OrderStatus;
  const patch = {
    status: fromOrderStatus(status),
    approved_by: status === "approved" ? session?.adminId : null,
    approved_at: status === "approved" ? new Date().toISOString() : null,
    rejected_by: status === "rejected" ? session?.adminId : null,
    rejected_at: status === "rejected" ? new Date().toISOString() : null,
  };

  const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
  if (error) throw error;

  await supabase.from("audit_events").insert({
    actor_admin_id: session?.adminId,
    event_type: status === "approved" ? "payment_approved" : status === "rejected" ? "payment_rejected" : "payment_reset",
    draw_round_id: order.draw_round_id,
    order_id: order.id,
    metadata: { public_code: order.public_code },
  });

  return Response.json({ ok: true });
}
