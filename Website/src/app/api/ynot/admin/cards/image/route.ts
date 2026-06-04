import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  allowedSlipTypes,
  maxSlipBytes,
  requestExceedsUploadLimit,
  verifyImageMagicBytes,
  type VerifiedImageContentType,
} from "@/lib/uploads/magic-bytes";

export const dynamic = "force-dynamic";

const bucketName = "lucky-draw-assets";

function extensionFor(type: VerifiedImageContentType) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function safePathPart(value: unknown) {
  const clean =
    typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60)
      : "";
  return clean || "card";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }

  const admin = await resolveAdminSession();
  if (!admin) {
    return Response.json(
      { error: "Admin access is required." },
      { status: 403 },
    );
  }

  const limited = await enforceRateLimit(
    request,
    "ynot:admin:cards:image",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  if (requestExceedsUploadLimit(request, maxSlipBytes)) {
    return Response.json(
      { error: "Card image must be 10 MB or smaller." },
      { status: 413 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "Invalid form payload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json(
      { error: "Card image file is required." },
      { status: 400 },
    );
  }

  if (!allowedSlipTypes.has(file.type)) {
    return Response.json(
      { error: "Card image must be JPG, PNG, or WEBP." },
      { status: 400 },
    );
  }

  if (file.size > maxSlipBytes) {
    return Response.json(
      { error: "Card image must be 10 MB or smaller." },
      { status: 400 },
    );
  }

  const magicCheck = await verifyImageMagicBytes(file);
  if (!magicCheck.ok) {
    return Response.json({ error: magicCheck.error }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const label = safePathPart(form.get("code") || form.get("name") || file.name);
  const ext = extensionFor(magicCheck.contentType);
  const path = `card-images/ynot-catalog/${day}/${Date.now()}-${crypto.randomUUID()}-${label}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(path, file.stream(), {
      contentType: magicCheck.contentType,
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "card_image_uploaded",
    metadata: {
      bucket: bucketName,
      path,
      size: file.size,
      contentType: magicCheck.contentType,
      originalFilename: file.name,
    },
  });

  return Response.json({
    imageUrl: data.publicUrl,
    storagePath: path,
  });
}
