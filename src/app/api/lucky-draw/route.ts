import { cookies } from "next/headers";
import { defaultDraw, seedOrders } from "@/lib/lucky-draw/defaults";
import { getActiveDraw, getLuckyDrawState, isSupabaseConfigured, toOrder } from "@/lib/lucky-draw/data";
import { readSessionCookie } from "@/lib/lucky-draw/session";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type CreateOrderBody = {
  quantity?: unknown;
  slipName?: unknown;
  customerNote?: unknown;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return Response.json({
      configured: false,
      state: { draw: defaultDraw, orders: seedOrders },
    });
  }

  const session = readSessionCookie(await cookies());
  const state = await getLuckyDrawState({
    profileId: session?.profileId,
    includeAllOrders: Boolean(session?.adminId),
  });

  return Response.json({
    configured: true,
    state: state ?? { draw: defaultDraw, orders: [] },
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const session = readSessionCookie(await cookies());
  if (!session) {
    return Response.json({ error: "LINE login is required before creating an order." }, { status: 401 });
  }

  let body: CreateOrderBody;
  try {
    body = (await request.json()) as CreateOrderBody;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
    return Response.json({ error: "Quantity must be between 1 and 50." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase);
  if (!activeDraw || activeDraw.status !== "live") {
    return Response.json({ error: "No live draw is accepting orders." }, { status: 409 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      draw_round_id: activeDraw.id,
      profile_id: session.profileId,
      quantity,
      amount_thb: quantity * activeDraw.price_thb,
      customer_note: typeof body.customerNote === "string" ? body.customerNote : null,
    })
    .select("*")
    .single();

  if (orderError) throw orderError;

  const slipName = typeof body.slipName === "string" && body.slipName.trim() ? body.slipName.trim() : "manual-transfer";
  const { error: slipError } = await supabase.from("payment_slips").insert({
    order_id: order.id,
    storage_provider: "manual_line",
    original_filename: slipName,
  });

  if (slipError) throw slipError;

  return Response.json({
    order: toOrder({
      order,
      lineName: session.displayName,
      slipName,
      slots: [],
    }),
  });
}
