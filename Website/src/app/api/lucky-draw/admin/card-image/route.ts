import { getActiveDraw, isSupabaseConfigured } from "@/lib/lucky-draw/data";
import { resolveAdminSession } from "@/lib/auth/resolve-current-profile";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

const bucketName = "lucky-draw-assets";
const maxCardImageBytes = 10 * 1024 * 1024;
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
    return Response.json({ error: "Card image file is required." }, { status: 400 });
  }

  if (!allowedTypes.has(file.type)) {
    return Response.json({ error: "Card image must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  if (file.size > maxCardImageBytes) {
    return Response.json({ error: "Card image must be 10 MB or smaller." }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const activeDraw = await getActiveDraw(supabase);
  if (!activeDraw) {
    return Response.json({ error: "No draw round exists yet." }, { status: 404 });
  }

  const path = `card-images/${activeDraw.id}/${Date.now()}.${extensionFor(file.type)}`;
  const { error: uploadError } = await supabase.storage.from(bucketName).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);

  await supabase.from("audit_events").insert({
    actor_admin_id: session.adminId,
    event_type: "card_image_uploaded",
    draw_round_id: activeDraw.id,
    metadata: { path },
  });

  return Response.json({ imageUrl: data.publicUrl, storagePath: path });
}
