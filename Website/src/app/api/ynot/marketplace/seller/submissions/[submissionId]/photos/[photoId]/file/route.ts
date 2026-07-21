import { resolveCurrentProfile } from "@/lib/auth/resolve-current-profile";
import { getMarketplaceAccountForProfile } from "@/lib/marketplace/account-bridge";
import {
  marketplaceErrorResponse,
  ownerOnlyMarketplaceAccess,
} from "@/lib/marketplace/route-guards";
import { marketplaceRequestId } from "@/lib/marketplace/route-utils";
import { createMarketplaceSupabaseClient } from "@/lib/marketplace/supabase-adapter";

export const dynamic = "force-dynamic";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function notFound() {
  return Response.json({ error: "Marketplace photo was not found." }, { status: 404 });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ submissionId: string; photoId: string }> },
) {
  const requestId = marketplaceRequestId(request);
  const profile = await resolveCurrentProfile();
  if (!profile?.profileId) {
    return Response.json(
      { error: "Login is required.", code: "marketplace_login_required" },
      { status: 401 },
    );
  }

  const access = await ownerOnlyMarketplaceAccess(profile);
  if (!access.allowed) return access.response;

  const { submissionId, photoId } = await ctx.params;
  if (!isUuid(submissionId) || !isUuid(photoId)) return notFound();

  try {
    const account = await getMarketplaceAccountForProfile(profile, access.admin);
    if (!account?.accountId) return notFound();

    const supabase = createMarketplaceSupabaseClient();
    const submissionResult = await supabase
      .from("marketplace_seller_submissions")
      .select("id")
      .eq("id", submissionId)
      .eq("marketplace_account_id", account.accountId)
      .maybeSingle();
    if (submissionResult.error || !submissionResult.data) return notFound();

    const photoResult = await supabase
      .from("marketplace_seller_submission_photos")
      .select("id,storage_bucket,storage_path,content_type")
      .eq("id", photoId)
      .eq("submission_id", submissionId)
      .eq("marketplace_account_id", account.accountId)
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
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return marketplaceErrorResponse(error, requestId);
  }
}
