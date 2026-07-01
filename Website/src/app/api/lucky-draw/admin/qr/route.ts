import { getActiveDraw, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { allowedSlipTypes, extensionForVerifiedImage, maxSlipBytes, requestExceedsUploadLimit, verifyImageMagicBytes } from "@/lib/uploads/magic-bytes";

const bucketName = "lucky-draw-assets";

export async function POST(request: Request) {
  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;

  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const session = await resolveAdminSession();
  if (!session) {
    return Response.json({ error: "Admin access is required." }, { status: 403 });
  }

  const limited = await enforceRateLimit(
    request,
    "ynot:legacy-admin:qr-image",
    { limit: 60, windowMs: 60_000 },
    session.profileId,
  );
  if (limited) return limited;

  if (requestExceedsUploadLimit(request, maxSlipBytes)) {
    return Response.json({ error: "QR image must be 10 MB or smaller." }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "Invalid form payload." }, { status: 400 });
  }

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
  if (!allowedSlipTypes.has(magicCheck.contentType)) {
    return Response.json({ error: "QR image must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase);
  if (!activeDraw) {
    return Response.json({ error: "No draw round exists yet." }, { status: 404 });
  }

  const path = `payment-qr/${activeDraw.id}-${Date.now()}.${extensionForVerifiedImage(magicCheck.contentType)}`;
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
