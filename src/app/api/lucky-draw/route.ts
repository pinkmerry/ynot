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

const slipBucketName = "payment-slips";
const maxSlipBytes = 10 * 1024 * 1024;
const allowedSlipTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function cleanFileName(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "payment-slip";
}

async function readCreateOrderRequest(request: Request): Promise<{
  quantity: number;
  slipName: string;
  customerNote: string | null;
  slipFile: File | null;
} | Response> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("slip");
    const slipFile = file instanceof File && file.size > 0 ? file : null;
    return {
      quantity: Number(form.get("quantity")),
      slipName:
        typeof form.get("slipName") === "string" && String(form.get("slipName")).trim()
          ? String(form.get("slipName")).trim()
          : slipFile?.name ?? "manual-transfer",
      customerNote: typeof form.get("customerNote") === "string" ? String(form.get("customerNote")) : null,
      slipFile,
    };
  }

  let body: CreateOrderBody;
  try {
    body = (await request.json()) as CreateOrderBody;
  } catch {
    return Response.json({ error: "Invalid order body." }, { status: 400 });
  }

  return {
    quantity: Number(body.quantity),
    slipName: typeof body.slipName === "string" && body.slipName.trim() ? body.slipName.trim() : "manual-transfer",
    customerNote: typeof body.customerNote === "string" ? body.customerNote : null,
    slipFile: null,
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return jsonNoStore({
      configured: false,
      state: { draw: defaultDraw, orders: seedOrders },
    });
  }

  const session = readSessionCookie(await cookies());
  const state = await getLuckyDrawState({
    profileId: session?.profileId,
    includeAllOrders: Boolean(session?.adminId),
  });

  return jsonNoStore({
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

  const parsed = await readCreateOrderRequest(request);
  if (parsed instanceof Response) return parsed;

  const { quantity, slipName, customerNote, slipFile } = parsed;
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 50) {
    return Response.json({ error: "Quantity must be between 1 and 50." }, { status: 400 });
  }

  if (slipFile && !allowedSlipTypes.has(slipFile.type)) {
    return Response.json({ error: "Slip must be JPG, PNG, WEBP, or PDF." }, { status: 400 });
  }

  if (slipFile && slipFile.size > maxSlipBytes) {
    return Response.json({ error: "Slip must be 10 MB or smaller." }, { status: 400 });
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
      customer_note: customerNote,
    })
    .select("*")
    .single();

  if (orderError) throw orderError;

  let storageProvider: "supabase" | "manual_line" = "manual_line";
  let filePath: string | null = null;

  if (slipFile) {
    storageProvider = "supabase";
    filePath = `${activeDraw.id}/${order.id}/${Date.now()}-${cleanFileName(slipFile.name)}`;
    const { error: uploadError } = await supabase.storage.from(slipBucketName).upload(filePath, slipFile, {
      contentType: slipFile.type,
      upsert: false,
    });

    if (uploadError) {
      await supabase.from("orders").delete().eq("id", order.id);
      return Response.json({ error: uploadError.message }, { status: 500 });
    }
  }

  const { error: slipError } = await supabase.from("payment_slips").insert({
    order_id: order.id,
    storage_provider: storageProvider,
    file_path: filePath,
    original_filename: slipName,
  });

  if (slipError) {
    if (filePath) await supabase.storage.from(slipBucketName).remove([filePath]);
    await supabase.from("orders").delete().eq("id", order.id);
    throw slipError;
  }

  return Response.json({
    order: toOrder({
      order,
      lineName: session.displayName,
      slipName,
      slipProvider: storageProvider,
      slipFilePath: filePath,
      slots: [],
    }),
  });
}
