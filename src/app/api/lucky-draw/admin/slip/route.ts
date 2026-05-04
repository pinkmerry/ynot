import { cookies } from "next/headers";
import { findOrderByPublicCode, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { readSessionCookie, verifyAdminSession } from "@/lib/lucky-draw/session";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const slipBucketName = "payment-slips";
const signedUrlTtlSeconds = 5 * 60;

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const session = await verifyAdminSession(readSessionCookie(await cookies()));
  if (!session) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId")?.trim();
  if (!orderId) {
    return Response.json({ error: "Missing order ID." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const order = await findOrderByPublicCode(supabase, orderId);
  if (!order) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }

  const { data: slip, error } = await supabase
    .from("payment_slips")
    .select("storage_provider,file_path,file_url,original_filename")
    .eq("order_id", order.id)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!slip) {
    return Response.json({ error: "No slip proof found for this order." }, { status: 404 });
  }

  if (slip.storage_provider !== "supabase" || !slip.file_path) {
    return Response.json({
      storageProvider: slip.storage_provider,
      originalFilename: slip.original_filename,
      signedUrl: null,
    });
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(slipBucketName)
    .createSignedUrl(slip.file_path, signedUrlTtlSeconds);

  if (signedUrlError) {
    return Response.json({ error: signedUrlError.message }, { status: 500 });
  }

  return Response.json({
    storageProvider: slip.storage_provider,
    originalFilename: slip.original_filename,
    signedUrl: data.signedUrl,
  });
}
