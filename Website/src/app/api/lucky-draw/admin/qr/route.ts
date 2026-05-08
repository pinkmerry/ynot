import { getActiveDraw, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const bucketName = "lucky-draw-assets";
const maxQrBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionFor(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const session = await resolveAdminSession();
  if (!session) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "QR image file is required." }, { status: 400 });
  }

  if (!allowedTypes.has(file.type)) {
    return Response.json({ error: "QR image must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  if (file.size > maxQrBytes) {
    return Response.json({ error: "QR image must be 10 MB or smaller." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase);
  if (!activeDraw) {
    return Response.json({ error: "No draw round exists yet." }, { status: 404 });
  }

  const path = `payment-qr/${activeDraw.id}-${Date.now()}.${extensionFor(file.type)}`;
  const { error: uploadError } = await supabase.storage.from(bucketName).upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  const qrImageUrl = data.publicUrl;

  const { error: updateError } = await supabase
    .from("draw_rounds")
    .update({ promptpay_qr_image_url: qrImageUrl })
    .eq("id", activeDraw.id);

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("audit_events").insert({
    actor_admin_id: session.adminId,
    event_type: "payment_qr_updated",
    draw_round_id: activeDraw.id,
    metadata: { path },
  });

  return Response.json({ qrImageUrl });
}
