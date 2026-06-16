import { requireAdminRoleResponse } from "@/lib/auth/admin-role-guard";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { enforceSameOriginMutation } from "@/lib/security/same-origin";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import {
  allowedSlipTypes,
  extensionForVerifiedImage,
  maxSlipBytes,
  requestExceedsUploadLimit,
  verifyImageMagicBytes,
} from "@/lib/uploads/magic-bytes";
import {
  adminErrorResponse,
  adminRouteErrorLog,
} from "@/lib/ynot/admin-api-errors";

export const dynamic = "force-dynamic";

const bucketName = "lucky-draw-assets";

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
  return clean || "payment-qr";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return adminErrorResponse("supabase_not_configured", "Supabase is not configured.", 503);
  }

  const crossOrigin = enforceSameOriginMutation(request);
  if (crossOrigin) return crossOrigin;

  const admin = await resolveAdminSession();
  if (!admin) {
    return adminErrorResponse("admin_required", "Admin access is required.", 403);
  }

  const roleFailure = requireAdminRoleResponse(admin, ["owner", "admin"]);
  if (roleFailure) return roleFailure;

  const limited = await enforceRateLimit(
    request,
    "ynot:admin:payment-methods:qr-image",
    { limit: 120, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  if (requestExceedsUploadLimit(request, maxSlipBytes)) {
    return Response.json(
      { error: "QR image must be 10 MB or smaller." },
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
      { error: "QR image file is required." },
      { status: 400 },
    );
  }

  if (!allowedSlipTypes.has(file.type)) {
    return Response.json(
      { error: "QR image must be JPG, PNG, or WEBP." },
      { status: 400 },
    );
  }

  if (file.size > maxSlipBytes) {
    return Response.json(
      { error: "QR image must be 10 MB or smaller." },
      { status: 400 },
    );
  }

  const magicCheck = await verifyImageMagicBytes(file);
  if (!magicCheck.ok) {
    return Response.json({ error: magicCheck.error }, { status: 400 });
  }
  if (!allowedSlipTypes.has(magicCheck.contentType)) {
    return Response.json(
      { error: "QR image must be JPG, PNG, or WEBP." },
      { status: 400 },
    );
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const label = safePathPart(
    form.get("code") || form.get("displayName") || file.name,
  );
  const ext = extensionForVerifiedImage(magicCheck.contentType);
  const path = `payment-qr/ynot-methods/${day}/${Date.now()}-${crypto.randomUUID()}-${label}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(path, file.stream(), {
      contentType: magicCheck.contentType,
      upsert: false,
    });

  if (uploadError) {
    adminRouteErrorLog("admin payment QR upload failed", uploadError, {
      adminId: admin.adminId,
      path,
    });
    return adminErrorResponse("qr_upload_failed", "Could not upload QR image.", 500);
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "payment_qr_image_uploaded",
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
