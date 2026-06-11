import { revalidatePath } from "next/cache";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  allowedVisualAssetTypes,
  extensionForVerifiedImage,
  verifyImageMagicBytes,
} from "@/lib/uploads/magic-bytes";

export const dynamic = "force-dynamic";

const ALLOWED_TIERS = new Set(["bronze", "silver", "gold", "rainbow"]);
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/webm"]);
const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
]);
const ALLOWED_POSTER_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);
const EXTENSION_BY_MIME = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/wav", "wav"],
  ["audio/ogg", "ogg"],
]);

function extensionForUpload(file: File, fallback: string) {
  const mapped = EXTENSION_BY_MIME.get(file.type);
  if (mapped) return mapped;
  const name = file.name?.toLowerCase() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot > -1 && dot < name.length - 1) return name.slice(dot + 1);
  return fallback;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured())
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const admin = await resolveAdminSession();
  if (!admin) return Response.json({ error: "Admin access is required." }, { status: 403 });
  const limited = await enforceRateLimit(
    request,
    "ynot:admin:tier-animations",
    { limit: 20, windowMs: 60_000 },
    admin.profileId,
  );
  if (limited) return limited;

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Invalid form payload." }, { status: 400 });

  const tier = String(form.get("tier") ?? "");
  if (!ALLOWED_TIERS.has(tier))
    return Response.json({ error: "Unknown tier." }, { status: 400 });

  const durationRaw = form.get("durationMs");
  const isActiveRaw = form.get("isActive");
  const videoFile = form.get("video");
  const audioFile = form.get("audio");
  const posterFile = form.get("poster");

  const updates: Record<string, unknown> = {
    updated_by_admin_id: admin.adminId,
  };

  if (typeof durationRaw === "string" && durationRaw.trim()) {
    const n = Number(durationRaw);
    if (!Number.isFinite(n) || n < 500 || n > 15000)
      return Response.json(
        { error: "Duration must be between 500 and 15000 ms." },
        { status: 400 },
      );
    updates.duration_ms = Math.round(n);
  }
  if (typeof isActiveRaw === "string")
    updates.is_active = isActiveRaw === "true" || isActiveRaw === "on";

  const supabase = createServiceSupabaseClient();

  async function uploadAndGetUrl(
    file: File,
    kind: "video" | "poster" | "sound",
    allowed: Set<string>,
    fallbackExt: string,
  ): Promise<string> {
    if (file.size > MAX_BYTES) throw new Error(`${kind} exceeds 20MB limit.`);
    if (file.type && !allowed.has(file.type))
      throw new Error(`${kind} type ${file.type} is not allowed.`);
    let contentType = file.type || undefined;
    let ext = extensionForUpload(file, fallbackExt);
    if (kind === "poster") {
      const magicCheck = await verifyImageMagicBytes(file);
      if (!magicCheck.ok) throw new Error(magicCheck.error);
      if (!allowedVisualAssetTypes.has(magicCheck.contentType)) {
        throw new Error("poster type is not allowed.");
      }
      contentType = magicCheck.contentType;
      ext = extensionForVerifiedImage(magicCheck.contentType);
    }
    const path = `${tier}/${kind}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("tier-animations")
      .upload(path, file.stream(), {
        contentType,
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);
    const { data: pub } = supabase.storage.from("tier-animations").getPublicUrl(path);
    return pub.publicUrl;
  }

  try {
    if (videoFile instanceof File && videoFile.size > 0) {
      updates.video_url = await uploadAndGetUrl(
        videoFile,
        "video",
        ALLOWED_VIDEO_MIME,
        "mp4",
      );
    }
    if (audioFile instanceof File && audioFile.size > 0) {
      updates.sound_url = await uploadAndGetUrl(
        audioFile,
        "sound",
        ALLOWED_AUDIO_MIME,
        "mp3",
      );
    }
    if (posterFile instanceof File && posterFile.size > 0) {
      updates.poster_url = await uploadAndGetUrl(
        posterFile,
        "poster",
        ALLOWED_POSTER_MIME,
        "png",
      );
    }
  } catch (uploadErr) {
    const message =
      uploadErr instanceof Error ? uploadErr.message : "Upload failed.";
    return Response.json({ error: message }, { status: 400 });
  }

  if (Object.keys(updates).length === 1)
    return Response.json(
      { error: "Nothing to update." },
      { status: 400 },
    );

  const { data, error } = await (supabase.from as unknown as (
    name: string,
  ) => {
    update: (values: Record<string, unknown>) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        select: (columns: string) => {
          single: () => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  })("tier_animations")
    .update(updates)
    .eq("tier", tier)
    .select("*")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 409 });

  await supabase.from("audit_events").insert({
    actor_admin_id: admin.adminId,
    event_type: "tier_animation_updated",
    metadata: { tier, fields: Object.keys(updates) },
  });

  revalidatePath("/admin/tier-animations");
  return Response.json({ tierAnimation: data });
}
