import { createMarketplaceSupabaseClient } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

const PUBLIC_PHOTO_STATUSES = [
  "seller_attached",
  "admin_approved",
  "public_derivative_ready",
] as const;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function notFound() {
  return Response.json({ error: "Marketplace photo was not found." }, { status: 404 });
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ submissionId: string; photoId: string }> },
) {
  const { submissionId, photoId } = await ctx.params;
  if (!isUuid(submissionId) || !isUuid(photoId)) return notFound();

  try {
    const supabase = createMarketplaceSupabaseClient();
    const submissionResult = await supabase
      .from("marketplace_seller_submissions")
      .select("id,listing_id,status")
      .eq("id", submissionId)
      .in("status", ["listed", "sold"])
      .not("listing_id", "is", null)
      .maybeSingle();
    if (submissionResult.error || !submissionResult.data) return notFound();

    const photoResult = await supabase
      .from("marketplace_seller_submission_photos")
      .select("id,storage_bucket,storage_path,content_type,status")
      .eq("id", photoId)
      .eq("submission_id", submissionId)
      .in("status", [...PUBLIC_PHOTO_STATUSES])
      .maybeSingle();
    if (photoResult.error || !photoResult.data) return notFound();

    const photo = photoResult.data;
    const downloadResult = await supabase.storage
      .from(photo.storage_bucket)
      .download(photo.storage_path);
    if (downloadResult.error || !downloadResult.data) return notFound();

    return new Response(await downloadResult.data.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": photo.content_type ?? "application/octet-stream",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
