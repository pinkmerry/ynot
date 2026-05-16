import { getActiveDraw, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { allowedSlipTypes, maxSlipBytes, verifyImageMagicBytes, type VerifiedImageContentType } from "@/lib/uploads/magic-bytes";

const bucketName = "lucky-draw-assets";

function extensionFor(type: VerifiedImageContentType) {
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

  if (!allowedSlipTypes.has(file.type)) {
    return Response.json({ error: "QR image must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  if (file.size > maxSlipBytes) {
    return Response.json({ error: "QR image must be 10 MB or smaller." }, { status: 400 });
  }

  const magicCheck = await verifyImageMagicBytes(file);
  if (!magicCheck.ok) {
    return Response.json({ error: magicCheck.error }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase);
  if (!activeDraw) {
    return Response.json({ error: "No draw round exists yet." }, { status: 404 });
  }

  const path = `payment-qr/${activeDraw.id}-${Date.now()}.${extensionFor(magicCheck.contentType)}`;
  const { error: uploadError } = await supabase.storage.from(bucketName).upload(path, file, {
    contentType: magicCheck.contentType,
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
